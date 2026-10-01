package io.github.neil1031.dashboard;
import java.nio.file.*;
/** Real subprocess fixture; never part of the shipped application. */
public class SignalsProcessFixture {
    public static void main(String[] args) throws Exception {
        switch (args[0]) {
            case "timeout" -> Thread.sleep(60_000);
            case "stderr" -> { System.err.write(new byte[InsiderSignalsAdapter.MAX_STDERR + 1]); System.out.write(Files.readAllBytes(Path.of(args[1]))); }
            case "stdout" -> System.out.write(new byte[InsiderSignalsAdapter.MAX_STDOUT + 1]);
            case "exit" -> { System.err.print("private C:\\secret\\database.sqlite and raw sensitive report"); System.exit(1); }
            case "invalid" -> System.out.print("<html>private malformed output</html>");
            case "utf8" -> System.out.write(new byte[]{(byte)0xff});
            case "duplicate" -> System.out.print("{\"contract_version\":1,\"contract_version\":2}");
            case "trailing" -> { System.out.write(Files.readAllBytes(Path.of(args[1]))); System.out.print(" {}"); }
            default -> System.out.write(Files.readAllBytes(Path.of(args[1])));
        }
    }
}
