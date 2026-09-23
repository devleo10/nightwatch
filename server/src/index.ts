import cors from "cors"
import express from "express"
import type { Speed } from "@queue-triage/shared"
import { subscribe } from "./broadcast.js"
import { pauseProducer, setProducerSpeed, startProducer } from "./producer.js"
import { queue } from "./queue.js"
import { redis } from "./redis.js"
import { snapshot } from "./stats.js"
import { startWorker } from "./worker.js"

const port = Number(process.env.PORT ?? 4000)

const app = express()
app.use(
  cors({
    origin(origin, callback) {
      if (!origin || /^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/.test(origin)) {
        callback(null, true)
        return
      }
      callback(new Error("Origin not allowed"))
    },
  }),
)
app.use(express.json())

app.get("/health", (_req, res) => {
  res.json({ ok: true })
})

app.get("/stats", (_req, res) => {
  res.json(snapshot())
})

app.post("/producer", (req, res) => {
  if (req.body?.running === true) startProducer()
  else pauseProducer()
  res.json(snapshot())
})

app.post("/producer/speed", (req, res) => {
  const speed: Speed = req.body?.speed === "fast" ? "fast" : "normal"
  setProducerSpeed(speed)
  res.json(snapshot())
})

app.get("/events", (req, res) => {
  res.setHeader("Content-Type", "text/event-stream")
  res.setHeader("Cache-Control", "no-cache, no-transform")
  res.setHeader("Connection", "keep-alive")
  res.setHeader("X-Accel-Buffering", "no")
  res.flushHeaders()
  res.write(": connected\n\n")

  const unsubscribe = subscribe((event) => {
    if (res.writableEnded) return
    res.write(`id: ${event.id}\ndata: ${JSON.stringify(event)}\n\n`)
  })

  const heartbeat = setInterval(() => {
    if (res.writableEnded) return
    res.write(": ping\n\n")
  }, 15000)

  req.on("close", () => {
    clearInterval(heartbeat)
    unsubscribe()
  })
})

async function main() {
  try {
    const pong = await redis.ping()
    if (pong !== "PONG") throw new Error("Redis did not respond to ping")
  } catch (error) {
    console.error("Redis is not reachable. Start it with: docker compose up -d")
    console.error(error)
    process.exit(1)
  }

  const worker = startWorker()
  startProducer()

  const server = app.listen(port, () => {
    console.log(`Nightwatch API listening on http://localhost:${port}`)
  })

  const shutdown = async () => {
    pauseProducer()
    server.close()
    await worker.close()
    await queue.close()
    redis.disconnect()
    process.exit(0)
  }

  process.on("SIGINT", () => {
    void shutdown()
  })
  process.on("SIGTERM", () => {
    void shutdown()
  })
}

void main()
