import { Router, type IRouter } from "express";
import healthRouter from "./health";
import usersRouter from "./users";
import canvassingRouter from "./canvassing";
import customersRouter from "./customers";
import jobsRouter from "./jobs";
import reviewsRouter from "./reviews";
import contentRouter from "./content";
import dashboardRouter from "./dashboard";
import reportsRouter from "./reports";
import calendarRouter from "./calendar";
import tasksRouter from "./tasks";
import phoneRouter from "./phone";
import formRouter from "./form";

const router: IRouter = Router();

router.use(healthRouter);
router.use("/users", usersRouter);
router.use("/canvassing", canvassingRouter);
router.use("/customers", customersRouter);
router.use("/jobs", jobsRouter);
router.use("/reviews", reviewsRouter);
router.use("/content", contentRouter);
router.use("/dashboard", dashboardRouter);
router.use("/reports", reportsRouter);
router.use("/calendar", calendarRouter);
router.use("/tasks", tasksRouter);
router.use("/phone", phoneRouter);
router.use("/form", formRouter);

export default router;
