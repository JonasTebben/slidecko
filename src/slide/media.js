// video and sound play from a blob: URL, not from their data: URL (up to 67 MB of text): Safari seeks and buffers
// those unreliably and keeps a second decoded copy; one URL per file, made when it is first played
const urls = new Map()
export function mediaUrl(data) {
  if (!data?.startsWith('data:') || typeof URL.createObjectURL !== 'function') return data
  if (!urls.has(data)) {
    const [head, body] = data.split(',', 2), type = head.slice(5).split(';')[0]
    const bytes = head.endsWith(';base64') ? Uint8Array.from(atob(body), c => c.charCodeAt(0)) : new TextEncoder().encode(decodeURIComponent(body))
    urls.set(data, URL.createObjectURL(new Blob([bytes], { type })))
  }
  return urls.get(data)
}
