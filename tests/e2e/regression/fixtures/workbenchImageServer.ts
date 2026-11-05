import { once } from 'node:events'
import { createServer } from 'node:http'

import sharp from 'sharp'

export async function startWorkbenchImageServer() {
  const images = await Promise.all(
    ['#cc2233', '#22aa55', '#dddd22', '#3355cc'].map((background) =>
      sharp({ create: { width: 32, height: 32, channels: 3, background } })
        .png()
        .toBuffer()
    )
  )
  const requests: Array<{ path: string; prompt: string; model: string; images: Buffer[] }> = []
  const errors: string[] = []
  const server = createServer(async (request, response) => {
    try {
      const path = request.url ?? ''
      if (request.method !== 'POST' || !['/v1/images/generations', '/v1/images/edits'].includes(path)) {
        response.writeHead(404).end()
        return
      }
      const chunks: Buffer[] = []
      for await (const chunk of request) chunks.push(Buffer.from(chunk))
      const body = Buffer.concat(chunks)
      let prompt: string
      let model: string
      const inputs: Buffer[] = []
      if (path.endsWith('/edits')) {
        const form = await new Response(new Uint8Array(body), {
          headers: { 'Content-Type': request.headers['content-type']! }
        }).formData()
        prompt = String(form.get('prompt'))
        model = String(form.get('model'))
        for (const [name, value] of form) {
          if ((name === 'image' || name === 'image[]') && typeof value !== 'string') {
            inputs.push(Buffer.from(await value.arrayBuffer()))
          }
        }
      } else {
        ;({ prompt, model } = JSON.parse(body.toString('utf8')))
      }
      const index = requests.length
      requests.push({ path, prompt, model, images: inputs })
      if (!images[index]) throw new Error('Unexpected extra generation')
      response
        .writeHead(200, { 'Content-Type': 'application/json' })
        .end(JSON.stringify({ created: 1, data: [{ b64_json: images[index].toString('base64') }] }))
    } catch (error) {
      errors.push(String(error))
      response
        .writeHead(500, { 'Content-Type': 'application/json' })
        .end(JSON.stringify({ error: { message: String(error) } }))
    }
  })
  server.listen(0, '127.0.0.1')
  await once(server, 'listening')
  const address = server.address()
  if (!address || typeof address === 'string') throw new Error('Image fixture did not bind a TCP port')
  return {
    baseUrl: `http://127.0.0.1:${address.port}/v1`,
    images,
    requests,
    errors,
    close: () =>
      new Promise<void>((resolve, reject) => {
        server.close((error) => (error ? reject(error) : resolve()))
        server.closeAllConnections()
      })
  }
}
