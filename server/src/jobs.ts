// One shared budget for searches and downloads: bounded children, pending work and time.
const MAX_ACTIVE = 2;
const MAX_PENDING = 40;
let active = 0;
const pending: Array<() => void> = [];
export function runJob<T>(work: () => Promise<T>): Promise<T> {
    if (pending.length >= MAX_PENDING)
        return Promise.reject(new Error('Downloader busy; try again shortly'));
    return new Promise<T>((resolve, reject) => {
        const run = () => {
            active++;
            Promise.resolve().then(work).then(resolve, reject).finally(() => {
                active--;
                pending.shift()?.();
            });
        };
        if (active < MAX_ACTIVE)
            run();
        else
            pending.push(run);
    });
}
export function jobStats() { return { active, pending: pending.length }; }
