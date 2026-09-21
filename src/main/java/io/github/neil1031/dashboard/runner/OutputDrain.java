package io.github.neil1031.dashboard.runner;

import java.io.IOException;
import java.io.InputStream;

/** Bounded transient sample, no output text/hash persisted. Drain past the cap to avoid backpressure. */
final class OutputDrain implements Runnable {
    static final int LIMIT = 64 * 1024;
    private final InputStream input;
    private long observed;
    private int sampled;
    private boolean complete;
    private boolean readFailed;

    OutputDrain(InputStream input) { this.input = input; }

    @Override public void run() {
        // This sample is intentionally never decoded or exposed; only its size is persisted in v1.
        byte[] sample = new byte[LIMIT];
        byte[] buffer = new byte[8192];
        try (input) {
            int size;
            while ((size = input.read(buffer)) != -1) {
                synchronized (this) {
                    observed = observed > Long.MAX_VALUE - size ? Long.MAX_VALUE : observed + size;
                    int keep = Math.min(size, LIMIT - sampled);
                    System.arraycopy(buffer, 0, sample, sampled, keep);
                    sampled += keep;
                }
            }
            synchronized (this) { complete = true; }
        } catch (IOException failure) {
            synchronized (this) { readFailed = true; }
        } finally { java.util.Arrays.fill(sample, (byte) 0); }
    }

    synchronized ExecutionReceipt.Output snapshot() {
        return new ExecutionReceipt.Output(observed, LIMIT, sampled, observed > LIMIT, complete, readFailed, false);
    }
}
