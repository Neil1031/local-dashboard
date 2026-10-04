package io.github.neil1031.dashboard;

import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.Arrays;

/** Actual test child process. It only emits synthetic bytes or sleeps. */
public class TwPerformanceProcessFixture {
    public static void main(String[] args) throws Exception {
        String mode = args[0];
        if (mode.equals("timeout")) { Thread.sleep(60_000); return; }
        if (mode.equals("utf8")) { System.out.write(new byte[] {(byte) 0xc3, (byte) 0x28}); return; }
        if (mode.equals("malformed")) { System.out.print("{"); return; }
        if (mode.equals("duplicate")) {
            System.out.print("{\"contractVersion\":\"tw-observed-performance-v1\",\"contractVersion\":\"tw-observed-performance-v1\"}");
            return;
        }
        if (mode.equals("exit-seven")) { System.err.print("private stderr C:\\secret\\db"); System.exit(7); }
        if (mode.equals("stderr-ceiling")) System.err.write(new byte[TaiwanPerformanceAdapter.MAX_STDERR]);
        if (mode.equals("stderr-overflow")) System.err.write(new byte[TaiwanPerformanceAdapter.MAX_STDERR + 1]);

        String text = Files.readString(Path.of(args[1]), StandardCharsets.UTF_8);
        System.out.print(text);
        if (mode.equals("trailing")) { System.out.print("{}"); return; }
        if (mode.equals("stdout-ceiling") || mode.equals("stdout-overflow")) {
            int extra = mode.equals("stdout-overflow") ? 1 : 0;
            int padding = TaiwanPerformanceAdapter.MAX_STDOUT + extra
                    - text.getBytes(StandardCharsets.UTF_8).length;
            byte[] spaces = new byte[padding]; Arrays.fill(spaces, (byte) ' '); System.out.write(spaces);
        }
        if (mode.equals("exit-two")) System.exit(2);
    }
}
