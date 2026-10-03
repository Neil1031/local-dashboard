package io.github.neil1031.dashboard;

import java.nio.file.*;
import java.nio.charset.StandardCharsets;
import java.util.Arrays;

/** Actual test child process. Only consumes a fixture path in OS TEMP. */
public class TwReportsProcessFixture {
    public static void main(String[] args) throws Exception {
        System.setOut(new java.io.PrintStream(System.out, true, StandardCharsets.UTF_8));
        String mode = args[0];
        if (mode.equals("timeout")) { Thread.sleep(60000); return; }
        if (mode.equals("utf8")) { System.out.write(new byte[] {(byte)0xc3, (byte)0x28}); return; }
        if (mode.equals("stdout")) { System.out.write(new byte[TaiwanReportsAdapter.MAX_STDOUT + 1]); return; }
        if (mode.equals("stderr")) { System.err.write(new byte[TaiwanReportsAdapter.MAX_STDERR + 1]); return; }
        if (mode.equals("exit")) { System.err.print("private stderr C:\\secret\\db"); System.exit(7); }
        if (mode.equals("duplicate")) { System.out.print("{\"contractVersion\":\"tw-reports-v1\",\"contractVersion\":\"tw-reports-v1\"}"); return; }
        if (mode.equals("invalid")) { System.out.print("{"); return; }
        String text = Files.readString(Path.of(args[1])); System.out.print(text);
        if (mode.equals("trailing")) System.out.print("{}");
        if (mode.equals("ceiling")) { byte[] pad = new byte[TaiwanReportsAdapter.MAX_STDOUT - text.getBytes(StandardCharsets.UTF_8).length]; Arrays.fill(pad, (byte)' '); System.out.write(pad); }
        if (mode.equals("exit2")) System.exit(2);
    }
}
