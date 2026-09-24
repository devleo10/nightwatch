import { startTriageServer } from "./app.js"
import { loadServerConfig } from "./config.js"

const config = loadServerConfig()
startTriageServer(config)
