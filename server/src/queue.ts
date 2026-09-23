import { Queue } from "bullmq"
import { QUEUE_NAME, redisConnection } from "./redis.js"

export const queue = new Queue(QUEUE_NAME, {
  connection: redisConnection,
  defaultJobOptions: {
    attempts: 1,
    removeOnComplete: 200,
    removeOnFail: 200,
  },
})
