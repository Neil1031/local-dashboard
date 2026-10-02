package io.github.neil1031.dashboard;

import java.nio.file.*;
import java.util.*;

/** Isolated real child process: never knows a formal source or invokes its writer. */
public class TwProcessFixture {
    public static void main(String[] args) throws Exception {
        System.setOut(new java.io.PrintStream(System.out, true, java.nio.charset.StandardCharsets.UTF_8));
        String mode = args[0];
        if (mode.equals("child")) { Thread.sleep(60000); return; }
        if (mode.equals("tree")) {
            var p = new ProcessBuilder(Path.of(System.getProperty("java.home"), "bin", "java.exe").toString(), "-cp", System.getProperty("java.class.path"), TwProcessFixture.class.getName(), "child").start();
            Files.writeString(Path.of(args[1] + ".pid"), Long.toString(p.pid())); Thread.sleep(60000); return;
        }
        if (mode.equals("timeout")) { Thread.sleep(60000); return; }
        if (mode.equals("utf8")) { System.out.write(new byte[]{(byte)0xc3, (byte)0x28}); return; }
        if (mode.equals("stdout")) { System.out.write(new byte[TaiwanStocksAdapter.MAX_STDOUT + 1]); return; }
        if (mode.equals("stderr")) { System.err.write(new byte[TaiwanStocksAdapter.MAX_STDERR + 1]); return; }
        if (mode.equals("argparse")) { System.err.print("private stderr C:\\secret\\db"); System.exit(2); }
        if (mode.equals("date-error")) { System.out.print("{\"error\":\"TARGET_DATE_INVALID\"}"); System.exit(2); }
        if (mode.equals("unexpected")) { System.err.print("private stderr C:\\secret\\db"); System.exit(7); }
        if (mode.equals("duplicate")) { System.out.print("{\"contract_version\":\"tw-daily-accumulation-v1\",\"contract_version\":\"tw-daily-accumulation-v1\"}"); return; }
        String content = Files.readString(Path.of(args[1]));
        System.out.print(content);
        if (mode.equals("trailing")) System.out.print("{}");
        if (mode.equals("ceiling")) { byte[] padding = new byte[TaiwanStocksAdapter.MAX_STDOUT - content.getBytes(java.nio.charset.StandardCharsets.UTF_8).length]; Arrays.fill(padding, (byte)' '); System.out.write(padding); }
        if (mode.equals("exit2")) System.exit(2);
    }
}
