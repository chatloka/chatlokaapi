// ============================================
// Conservative allowlist HTML sanitizer for inbound email HTML.
// No dependencies. Deterministic single-pass scanner: text is preserved
// verbatim (entities are NOT decoded), and any markup that cannot be parsed
// as a well-formed allowed tag is removed (over-stripping on uncertainty).
// ============================================

const ALLOWED_TAGS = new Set([
  "p", "br", "b", "strong", "i", "em", "u", "s", "a", "ul", "ol", "li",
  "blockquote", "pre", "code", "table", "thead", "tbody", "tr", "th", "td",
  "h1", "h2", "h3", "h4", "img", "span", "div", "hr",
])

// These tags are dropped together with their entire content.
const STRIP_WITH_CONTENT = new Set([
  "script", "iframe", "object", "embed", "style",
])

// Void elements in the strip list: they never carry content, so there is no
// closing tag to look for (skipping to EOF would eat legitimate text after).
const STRIP_VOID_TAGS = new Set(["link", "meta"])

// Void elements never get a closing tag.
const VOID_TAGS = new Set(["br", "img", "hr"])

const HREF_RE = /^(https?:|mailto:)/i
const SRC_RE = /^https?:/i
const CLASS_LANGUAGE_RE = /^language-[a-zA-Z0-9_+-]+$/
const NUMERIC_RE = /^[0-9]{1,4}$/
const ALIGN_RE = /^(left|center|right|justify)$/i

function isAsciiLetter(code: number): boolean {
  return (code >= 65 && code <= 90) || (code >= 97 && code <= 122)
}

function isAsciiDigit(code: number): boolean {
  return code >= 48 && code <= 57
}

function isTagNameChar(code: number): boolean {
  return isAsciiLetter(code) || isAsciiDigit(code)
}

function isAttrNameChar(code: number): boolean {
  return (
    isTagNameChar(code) ||
    code === 45 || // -
    code === 95 || // _
    code === 58 || // :
    code === 46    // .
  )
}

function isWhitespace(code: number): boolean {
  return code === 32 || code === 9 || code === 10 || code === 12 || code === 13
}

/** Scan a tag name starting at `start`; returns the index just past the name. */
function scanTagName(html: string, start: number): number {
  let i = start
  const len = html.length
  while (i < len && isTagNameChar(html.charCodeAt(i))) i++
  return i
}

/** Find the '>' that closes a tag, respecting quoted attribute values. */
function findTagEnd(html: string, start: number): number {
  let quote = 0
  for (let i = start; i < html.length; i++) {
    const c = html.charCodeAt(i)
    if (quote !== 0) {
      if (c === quote) quote = 0
      continue
    }
    if (c === 34 || c === 39) quote = c // " or '
    else if (c === 62) return i // >
  }
  return -1
}

interface ParsedTag {
  attrs: Map<string, string>
  end: number
}

/**
 * Parse the attributes of an opening tag starting just past its name.
 * Returns null when the tag is malformed (unterminated quote, no '>' before
 * EOF) so the caller can over-strip the whole tag.
 */
function parseTagAttrs(html: string, start: number): ParsedTag | null {
  const attrs = new Map<string, string>()
  const len = html.length
  let i = start

  while (i < len) {
    while (i < len) {
      const c = html.charCodeAt(i)
      if (isWhitespace(c) || c === 47) { i++; continue } // whitespace or '/'
      break
    }
    if (i >= len) return null
    if (html.charCodeAt(i) === 62) return { attrs, end: i } // '>'

    const nameStart = i
    while (i < len && isAttrNameChar(html.charCodeAt(i))) i++
    if (i === nameStart) return null // no attribute name → malformed
    const attrName = html.slice(nameStart, i)

    while (i < len && isWhitespace(html.charCodeAt(i))) i++

    let attrValue = ""
    if (i < len && html.charCodeAt(i) === 61) { // '='
      i++
      while (i < len && isWhitespace(html.charCodeAt(i))) i++
      if (i >= len) return null
      const q = html.charCodeAt(i)
      if (q === 34 || q === 39) { // quoted value
        i++
        const valStart = i
        while (i < len && html.charCodeAt(i) !== q) i++
        if (i >= len) return null // unterminated quote → malformed
        attrValue = html.slice(valStart, i)
        i++
      } else {
        const valStart = i
        while (i < len && !isWhitespace(html.charCodeAt(i)) && html.charCodeAt(i) !== 62) i++
        attrValue = html.slice(valStart, i)
      }
    }

    attrs.set(attrName, attrValue)
  }

  return null
}

/** Reject values that could break out of the emitted attribute (raw control chars, quotes, '<' '>'). */
function isSafeAttrValue(value: string): boolean {
  for (let i = 0; i < value.length; i++) {
    const c = value.charCodeAt(i)
    if (c < 0x20 || c === 0x7f || c === 34 || c === 60 || c === 62) return false
  }
  return true
}

/** Re-emit a normalized opening tag carrying only the allowlisted attributes. */
function buildTag(name: string, attrs: Map<string, string>): string {
  const kept: string[] = []
  for (const [rawName, value] of attrs) {
    const attr = rawName.toLowerCase()
    if (!isSafeAttrValue(value)) continue
    if (attr.startsWith("on")) continue
    if (attr === "style" || attr === "id" || attr === "srcdoc" || attr === "sandbox" || attr === "formaction") continue

    let ok = false
    switch (name) {
      case "a":
        if (attr === "href" && HREF_RE.test(value)) ok = true
        break
      case "img":
        if (attr === "src" && SRC_RE.test(value)) ok = true
        else if (attr === "alt") ok = true
        break
      case "table":
      case "td":
      case "th":
        if (attr === "colspan" && NUMERIC_RE.test(value)) ok = true
        else if (attr === "rowspan" && NUMERIC_RE.test(value)) ok = true
        else if (attr === "align" && ALIGN_RE.test(value)) ok = true
        break
      case "pre":
      case "code":
        if (attr === "class" && CLASS_LANGUAGE_RE.test(value)) ok = true
        break
    }

    if (ok) kept.push(`${attr}="${value}"`)
  }
  return kept.length > 0 ? `<${name} ${kept.join(" ")}>` : `<${name}>`
}

/**
 * Skip everything from a strip-with-content element (script, style, ...)
 * up to and including its closing tag, scanning case-insensitively.
 * Returns the index just past the closing '>' (or the end of the input).
 */
function skipElementWithContent(html: string, start: number, name: string): number {
  const len = html.length
  let i = start + 1
  while (i < len) {
    const lt = html.indexOf("<", i)
    if (lt === -1) return len
    if (lt + 2 + name.length <= len && html.slice(lt + 2, lt + 2 + name.length).toLowerCase() === name) {
      let j = lt + 2 + name.length
      while (j < len && isWhitespace(html.charCodeAt(j))) j++
      if (j < len && html.charCodeAt(j) === 62) return j + 1
    }
    i = lt + 1
  }
  return len
}

/**
 * Sanitize untrusted HTML with a conservative allowlist. Text content is kept
 * as-is (nothing is entity-decoded); tags not in the allowlist are removed
 * (their content is kept except for script/iframe/object/embed/style/link/meta).
 * Any markup that cannot be parsed cleanly is over-stripped.
 */
export function sanitizeHtml(html: string): string {
  let out = ""
  const len = html.length
  let i = 0

  while (i < len) {
    if (html.charCodeAt(i) !== 60) { // '<'
      out += html[i]
      i++
      continue
    }

    // <!-- comments -->
    if (html.startsWith("<!--", i)) {
      const end = html.indexOf("-->", i + 4)
      i = end === -1 ? len : end + 3
      continue
    }

    // CDATA / doctype / processing instructions
    if (html[i + 1] === "!" || html[i + 1] === "?") {
      const end = findTagEnd(html, i)
      i = end === -1 ? len : end + 1
      continue
    }

    // Closing tag
    if (html[i + 1] === "/") {
      const nameEnd = scanTagName(html, i + 2)
      if (nameEnd > i + 2) {
        const name = html.slice(i + 2, nameEnd).toLowerCase()
        let pos = nameEnd
        while (pos < len && isWhitespace(html.charCodeAt(pos))) pos++
        if (pos < len && html.charCodeAt(pos) === 62) {
          if (ALLOWED_TAGS.has(name) && !VOID_TAGS.has(name)) out += `</${name}>`
          i = pos + 1
          continue
        }
      }
      // Malformed closing tag → strip it
      const end = findTagEnd(html, i)
      i = end === -1 ? len : end + 1
      continue
    }

    // Opening tag
    if (i + 1 < len && isAsciiLetter(html.charCodeAt(i + 1))) {
      const nameEnd = scanTagName(html, i + 1)
      const name = html.slice(i + 1, nameEnd).toLowerCase()
      const parsed = parseTagAttrs(html, nameEnd)
      if (!parsed) {
        // Malformed → over-strip the whole tag
        const end = findTagEnd(html, i)
        i = end === -1 ? len : end + 1
        continue
      }
      if (STRIP_WITH_CONTENT.has(name)) {
        i = skipElementWithContent(html, i, name)
        continue
      }
      if (STRIP_VOID_TAGS.has(name)) {
        i = parsed.end + 1
        continue
      }
      if (ALLOWED_TAGS.has(name)) {
        out += buildTag(name, parsed.attrs)
      }
      i = parsed.end + 1
      continue
    }

    // Stray '<' that does not begin a tag → remove it
    i++
  }

  return out
}

/**
 * Remove CR, LF and every control character below 0x20 (tab is kept) plus
 * DEL. Used to defend against header/CRLF injection at service boundaries.
 */
export function stripControlChars(value: string): string {
  let out = ""
  for (let i = 0; i < value.length; i++) {
    const code = value.charCodeAt(i)
    if (code === 0x09) out += value[i]
    else if (code < 0x20 || code === 0x7f) continue
    else out += value[i]
  }
  return out
}
