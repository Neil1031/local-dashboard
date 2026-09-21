package io.github.neil1031.dashboard.launcher;

import java.io.IOException;
import java.nio.ByteBuffer;
import java.nio.channels.FileChannel;
import java.nio.file.FileAlreadyExistsException;
import java.nio.file.Files;
import java.nio.file.LinkOption;
import java.nio.file.Path;
import static java.nio.file.StandardOpenOption.WRITE;

/** Publishes the shared example as a complete, create-only external config. */
final class ConfigBootstrap {
    private ConfigBootstrap() { }

    static boolean ensure(Path home) throws IOException {
        Path destination = home.resolve("config/application.yml");
        // A dangling link or other existing directory entry also belongs to the user.
        if (Files.exists(destination, LinkOption.NOFOLLOW_LINKS)) return false;
        Files.createDirectories(destination.getParent());
        byte[] template;
        try (var input = ConfigBootstrap.class.getResourceAsStream("/bootstrap/application.example.yml")) {
            if (input == null) throw new IOException("Packaged bootstrap config template is missing.");
            template = input.readAllBytes();
        }
        Path pending = Files.createTempFile(destination.getParent(), ".application-", ".tmp");
        try {
            try (var channel = FileChannel.open(pending, WRITE)) {
                var buffer = ByteBuffer.wrap(template);
                while (buffer.hasRemaining()) channel.write(buffer);
                channel.force(true);
            }
            // NTFS hard-link creation atomically adds a NEW name to the completed file.
            // Unlike ATOMIC_MOVE (whose replacement behavior is provider-specific), it
            // cannot replace an existing name, even if another writer wins this race.
            try {
                Files.createLink(destination, pending);
                return true;
            } catch (FileAlreadyExistsException anotherWriterWon) {
                return false;
            } catch (UnsupportedOperationException unsupported) {
                throw new IOException("Config bootstrap requires a filesystem supporting hard links (for example NTFS).", unsupported);
            }
        } finally {
            // Removes only this invocation's temporary name, never application.yml.
            Files.deleteIfExists(pending);
        }
    }
}
