package io.github.neil1031.dashboard.runner;

import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;

/** Test-only executable; not packaged in either production JAR. No scheduler operations. */
public final class RunnerFixture {
    public static void main(String[] args) throws Exception {
        switch (args[0]) {
            case "exit" -> System.exit(Integer.parseInt(args[1]));
            case "marker" -> {
                Files.writeString(Path.of(args[1]), "child-executed", StandardCharsets.UTF_8);
                System.exit(Integer.parseInt(args[2]));
            }
            case "unicode" -> {
                if (!args[1].equals("參數 空白 & ; $(test) \"literal\"")) System.exit(19);
                Files.writeString(Path.of("輸出 文件.txt"), "中文 😀", StandardCharsets.UTF_8);
                System.out.write("中文 😀".getBytes(StandardCharsets.UTF_8));
                System.err.write("錯誤 測試".getBytes(StandardCharsets.UTF_8));
            }
            case "flood" -> {
                int size = Integer.parseInt(args[1]);
                byte[] chunk = new byte[8192];
                java.util.Arrays.fill(chunk, (byte) 'x');
                Thread error = new Thread(() -> {
                    for (int remaining = size; remaining > 0; remaining -= chunk.length)
                        System.err.write(chunk, 0, Math.min(remaining, chunk.length));
                });
                error.start();
                for (int remaining = size; remaining > 0; remaining -= chunk.length)
                    System.out.write(chunk, 0, Math.min(remaining, chunk.length));
                error.join();
            }
            case "stdin" -> { if (System.in.read() != -1) System.exit(9); }
            case "wait-marker" -> {
                Files.writeString(Path.of(args[1]), "started");
                Thread.sleep(Long.parseLong(args[3]));
                Files.writeString(Path.of(args[2]), "finished");
            }
            case "descendant" -> {
                new ProcessBuilder(Path.of(System.getProperty("java.home"), "bin", "java.exe").toString(),
                        "-cp", System.getProperty("java.class.path"), RunnerFixture.class.getName(),
                        "wait-marker", args[1], args[2], args[3]).inheritIO().start();
                System.exit(7);
            }
            default -> throw new IllegalArgumentException("Invalid fixture mode");
        }
    }
}
