import express, { type Express, type Request } from "express";
import cors from "cors";
import router from "./routes";
import feedbackRouter from "./routes/feedback";
import { startScheduler } from "./lib/scheduler";

const app: Express = express();

app.use(cors());

// Capture raw body buffer for webhook HMAC verification before JSON parsing
app.use(
  express.json({
    verify: (req: Request, _res, buf) => {
      (req as any).rawBody = buf;
    },
  })
);
app.use(express.urlencoded({ extended: true }));

// Feedback form — served at /feedback (custom domain: feedback.myhealthyhome.io)
app.use("/feedback", feedbackRouter);

app.use("/api", router);

startScheduler();

export default app;
