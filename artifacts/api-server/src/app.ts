import express, { type Express } from "express";
import cors from "cors";
import router from "./routes";
import { startScheduler } from "./lib/scheduler";

const app: Express = express();

app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

app.use("/api", router);

startScheduler();

export default app;
