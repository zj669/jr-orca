import { Buffer } from 'node:buffer'

export class JrMcpStdioBuffer {
  private pending = Buffer.alloc(0)

  push(chunk: Buffer): unknown[] {
    this.pending = Buffer.concat([this.pending, chunk])
    const messages: unknown[] = []
    while (true) {
      const extracted = this.extractOne()
      if (extracted === undefined) {
        return messages
      }
      messages.push(extracted)
    }
  }

  private extractOne(): unknown | undefined {
    if (this.pending.length === 0) {
      return undefined
    }
    if (this.pending[0] === 0x7b) {
      const newline = this.pending.indexOf(0x0a)
      if (newline === -1) {
        return undefined
      }
      const line = this.pending.subarray(0, newline).toString('utf8').replace(/\r$/, '')
      this.pending = this.pending.subarray(newline + 1)
      if (line.trim().length === 0) {
        return this.extractOne()
      }
      return parseJsonMessage(line)
    }
    const headerEnd = indexOfHeaderDelimiter(this.pending)
    if (headerEnd === -1) {
      return undefined
    }
    const header = this.pending.subarray(0, headerEnd).toString('utf8')
    const lengthMatch = /Content-Length:\s*(\d+)/i.exec(header)
    if (!lengthMatch) {
      throw new Error('JR MCP stdio message is missing Content-Length.')
    }
    const length = Number(lengthMatch[1])
    const bodyStart = headerEnd + 4
    if (this.pending.length < bodyStart + length) {
      return undefined
    }
    const body = this.pending.subarray(bodyStart, bodyStart + length).toString('utf8')
    this.pending = this.pending.subarray(bodyStart + length)
    return parseJsonMessage(body)
  }
}

export function encodeJrMcpMessage(message: unknown): Buffer {
  const json = JSON.stringify(message)
  const header = `Content-Length: ${Buffer.byteLength(json, 'utf8')}\r\n\r\n`
  return Buffer.concat([Buffer.from(header, 'utf8'), Buffer.from(json, 'utf8')])
}

function indexOfHeaderDelimiter(buffer: Buffer): number {
  for (let index = 0; index + 3 < buffer.length; index += 1) {
    if (
      buffer[index] === 0x0d &&
      buffer[index + 1] === 0x0a &&
      buffer[index + 2] === 0x0d &&
      buffer[index + 3] === 0x0a
    ) {
      return index
    }
  }
  return -1
}

function parseJsonMessage(text: string): unknown {
  const parsed: unknown = JSON.parse(text)
  return parsed
}
