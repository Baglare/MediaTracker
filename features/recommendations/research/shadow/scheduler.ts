export interface PostResponseTaskScheduler {
  schedule(task: () => Promise<void>): void;
}
