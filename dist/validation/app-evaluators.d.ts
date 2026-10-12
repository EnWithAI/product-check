import { type Evaluator } from "./context.js";
/** True for loopback development servers, where HTTPS is normally terminated elsewhere. */
export declare const isLoopback: (url: string) => boolean;
/** Application evaluators by control ID. */
export declare const APP_EVALUATORS: Record<string, Evaluator>;
