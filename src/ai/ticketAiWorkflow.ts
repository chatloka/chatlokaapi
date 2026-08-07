import { WorkflowEntrypoint, type WorkflowEvent, type WorkflowStep } from 'cloudflare:workers'
import type { CloudflareBindings } from '../types'
import { TicketService, type Ticket } from '../services/ticket'
import {
  AI_MODEL,
  AI_SCHEMA_VERSION,
  SYSTEM_PROMPT,
  buildUserMessage,
  callOpenAiStructured,
  clipChars,
  estimateCostUsd,
  scanForInjection,
  stripHtml,
  type AiMessageInput,
} from './analyze'

export interface TicketAiParams {
  ticket_id: number
}

interface LoadedTicket {
  ticket: Ticket
  messages: AiMessageInput[]
}

/**
 * Durable ticket-analysis pipeline.
 *
 * - `load ticket context` — fetch the ticket + messages from D1 (waits once
 *   for the webhook to finish writing the first message).
 * - `analyze with openai` — one structured-output call (I/O-bound; wall-clock
 *   per step is unlimited, so the Worker's 100 s request limit never applies).
 *   Retries with exponential backoff on API failures.
 * - `store result` — deterministic validation already happened inside the
 *   analyze step; this step upserts the row the UI polls.
 */
export class TicketAiWorkflow extends WorkflowEntrypoint<CloudflareBindings, TicketAiParams> {
  async run(event: WorkflowEvent<TicketAiParams>, step: WorkflowStep): Promise<unknown> {
    const ticketId = event.payload.ticket_id

    // Mark the job as processing up front so the UI shows a live status even
    // before the first step finishes.
    await this.db().prepare("UPDATE ticket_ai_analyses SET status = 'processing', workflow_instance_id = ?, updated_at = datetime('now') WHERE ticket_id = ?")
      .bind(event.instanceId, ticketId).run()

    const loaded = await step.do('load ticket context', async () => {
      const ticketService = new TicketService(this.env.DB)
      const ticket = await ticketService.getTicketById(ticketId)
      if (!ticket) throw new Error(`Ticket ${ticketId} not found`)

      const messages: AiMessageInput[] = (await ticketService.getTicketMessages(ticketId)).map((m) => ({
        direction: m.direction,
        created_at: m.created_at,
        body: clipChars(stripHtml(m.body_html || m.body_text || ''), 6000),
      }))

      return { ticket, messages } satisfies LoadedTicket
    })

    // The Resend webhook creates the ticket and then writes the first message
    // a moment later. If we raced it, wait once and re-read.
    if (loaded.messages.length === 0) {
      await step.sleep('wait for first message', '10 seconds')
      const ticketService = new TicketService(this.env.DB)
      const messages: AiMessageInput[] = (await ticketService.getTicketMessages(ticketId)).map((m) => ({
        direction: m.direction,
        created_at: m.created_at,
        body: clipChars(stripHtml(m.body_html || m.body_text || ''), 6000),
      }))
      loaded.messages = messages
    }

    const analysis = await step.do(
      'analyze with openai',
      {
        retries: { limit: 2, delay: '5 seconds', backoff: 'exponential' },
        timeout: '15 minutes',
      },
      async () => {
        const userMessage = buildUserMessage(loaded.ticket, loaded.messages)
        const heuristic = scanForInjection(userMessage)

        const { result, refusal, metrics } = await callOpenAiStructured(this.env, SYSTEM_PROMPT, userMessage)

        return {
          result: refusal ? null : result,
          refusal: refusal || null,
          heuristicFlagged: heuristic.flagged,
          heuristicEvidence: heuristic.evidence,
          metrics,
          promptChars: userMessage.length,
        }
      },
    )

    await step.do('store result', async () => {
      const db = this.db()

      if (analysis.refusal || !analysis.result) {
        await db.prepare(
          `UPDATE ticket_ai_analyses
           SET status = 'failed',
               model = ?, workflow_instance_id = ?, refusal = ?,
               heuristic_injection = ?, prompt_chars = ?,
               input_tokens = ?, output_tokens = ?, latency_ms = ?,
               cost_usd = ?, error = ?, updated_at = datetime('now')
           WHERE ticket_id = ?`
        ).bind(
          AI_MODEL,
          event.instanceId,
          analysis.refusal,
          analysis.heuristicFlagged ? 1 : 0,
          analysis.promptChars,
          analysis.metrics.input_tokens,
          analysis.metrics.output_tokens,
          analysis.metrics.latency_ms,
          estimateCostUsd(analysis.metrics.input_tokens, analysis.metrics.output_tokens),
          analysis.refusal ? 'model refused to analyze' : 'no result',
          ticketId,
        ).run()
        return
      }

      const r = analysis.result
      await db.prepare(
        `UPDATE ticket_ai_analyses
         SET status = 'completed',
             model = ?, workflow_instance_id = ?, schema_version = ?,
             summary = ?, category = ?, priority = ?, sentiment = ?,
             key_points = ?, suggested_steps = ?, tags = ?, confidence = ?,
             injection_detected = ?, injection_evidence = ?,
             heuristic_injection = ?, prompt_chars = ?,
             input_tokens = ?, output_tokens = ?, latency_ms = ?, cost_usd = ?,
             error = NULL, updated_at = datetime('now')
         WHERE ticket_id = ?`
      ).bind(
        AI_MODEL,
        event.instanceId,
        AI_SCHEMA_VERSION,
        r.summary,
        r.category,
        r.priority,
        r.sentiment,
        JSON.stringify(r.key_points),
        JSON.stringify(r.suggested_steps),
        JSON.stringify(r.tags),
        r.confidence,
        r.injection_detected ? 1 : 0,
        r.injection_evidence,
        analysis.heuristicFlagged ? 1 : 0,
        analysis.promptChars,
        analysis.metrics.input_tokens,
        analysis.metrics.output_tokens,
        analysis.metrics.latency_ms,
        estimateCostUsd(analysis.metrics.input_tokens, analysis.metrics.output_tokens),
        ticketId,
      ).run()
    })

    return { ticket_id: ticketId, status: analysis.refusal ? 'failed' : 'completed' }
  }

  private db(): D1Database {
    return this.env.DB
  }
}
