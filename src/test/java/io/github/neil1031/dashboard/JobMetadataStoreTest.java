package io.github.neil1031.dashboard;

import com.fasterxml.jackson.databind.ObjectMapper;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.io.TempDir;

import java.io.IOException;
import java.nio.file.Files;
import java.nio.file.Path;

import static org.junit.jupiter.api.Assertions.*;

class JobMetadataStoreTest {
    @TempDir Path temp;
    ObjectMapper mapper = new ObjectMapper();

    @Test void restartRevisionAndAtomicReplacement() throws Exception {
        Path path = temp.resolve("config/job-metadata.json");
        var store = new JobMetadataStore(mapper, path);
        assertEquals("0", store.read().revision());
        var overrides = mapper.readTree("""
            {"AIStockHunter-UnexplainedVolume-Daily":{"displayName":"台股每日掃描"}}
            """);
        var saved = store.save("0", overrides);
        assertNotEquals("0", saved.revision());
        assertEquals("台股每日掃描", new JobMetadataStore(mapper, path).read().overrides()
                .path("AIStockHunter-UnexplainedVolume-Daily").path("displayName").asText());
        assertThrows(JobMetadataStore.Conflict.class, () -> store.save("0", mapper.createObjectNode()));
        assertEquals(saved.revision(), store.read().revision());
        assertEquals(0, Files.list(path.getParent()).filter(p -> p.getFileName().toString().endsWith(".tmp")).count());
    }

    @Test void corruptAndUnsupportedFilesRemainUntouched() throws Exception {
        Path path = temp.resolve("bad.json");
        var store = new JobMetadataStore(mapper, path);
        for (String invalid : new String[] {"{oops", "{\"version\":2,\"overrides\":{}}", "{\"version\":1,\"overrides\":{\"x\":{\"order\":-1}}}"}) {
            Files.writeString(path, invalid);
            assertNotNull(store.read().warning());
            assertTrue(store.read().overrides().isEmpty());
            assertThrows(JobMetadataStore.Invalid.class, () -> store.save(null, mapper.createObjectNode()));
            assertEquals(invalid, Files.readString(path));
        }
    }

    @Test void validationRejectsCyclesUnknownInternalAndBadTextOrOrder() throws Exception {
        for (String invalid : new String[] {
                "{\"A\":{\"dependsOn\":[{\"task\":\"A\",\"kind\":\"data\"}]}}",
                "{\"A\":{\"dependsOn\":[{\"task\":\"B\",\"kind\":\"data\"}]},\"B\":{\"dependsOn\":[{\"task\":\"A\",\"kind\":\"orderOnly\"}]}}",
                "{\"A\":{\"dependsOn\":[{\"task\":\"Missing\",\"kind\":\"data\"}]}}",
                "{\"A\":{\"order\":10001}}",
                "{\"A\":{\"displayName\":\"" + "x".repeat(101) + "\"}}",
                "{\"A\":{\"description\":\"" + "x".repeat(1001) + "\"}}" }) {
            assertThrows(JobMetadataStore.Invalid.class, () -> JobMetadataStore.validate(mapper.readTree(invalid)), invalid);
        }
        JobMetadataStore.validate(mapper.readTree("{\"A\":{\"dependsOn\":[{\"task\":\"External report\",\"kind\":\"external\"}]}}"));
    }

    @Test void failedReplaceKeepsPreviousFileAndCleansTemporaryFile() throws Exception {
        Path path = temp.resolve("config/job-metadata.json");
        var original = new JobMetadataStore(mapper, path);
        var saved = original.save("0", mapper.readTree("{\"A\":{\"order\":5}}"));
        byte[] before = Files.readAllBytes(path);
        var failing = new JobMetadataStore(mapper, path) {
            @Override void replace(Path source, Path target) throws IOException { throw new IOException("simulated"); }
        };
        assertThrows(IOException.class, () -> failing.save(saved.revision(), mapper.readTree("{\"A\":{\"order\":6}}")));
        assertArrayEquals(before, Files.readAllBytes(path));
        assertEquals(1, Files.list(path.getParent()).count());
    }

    @Test void exactDatedOmissionInheritsDefaultAndReverseEdgeIsCycle() throws Exception {
        String exact = "AIStockHunter-Accumulation-Check-2026-09-22";
        var onlyExactName = mapper.readTree("{\"" + exact + "\":{\"displayName\":\"特定日期\"}}");
        JobMetadataStore.validate(onlyExactName);
        var cycle = mapper.readTree("""
            {
              "AIStockHunter-Accumulation-Check-2026-09-22": {"displayName":"特定日期"},
              "AIStockHunter-UnexplainedVolume-Daily": {"dependsOn":[{"task":"AIStockHunter-Accumulation-Check-2026-09-22","kind":"data"}]}
            }
            """);
        assertEquals("DEPENDENCY_CYCLE", assertThrows(JobMetadataStore.Invalid.class,
                () -> JobMetadataStore.validate(cycle)).getMessage());
    }

    @Test void explicitEmptyExactDependenciesClearInheritedPatternEdge() throws Exception {
        var overrides = mapper.readTree("""
            {
              "AIStockHunter-Accumulation-Check-2026-09-22": {"dependsOn":[]},
              "AIStockHunter-UnexplainedVolume-Daily": {"dependsOn":[{"task":"AIStockHunter-Accumulation-Check-2026-09-22","kind":"data"}]}
            }
            """);
        JobMetadataStore.validate(overrides);
    }

    @Test void patternUserDependencyIsInheritedUnlessExactExplicitlyOverridesIt() throws Exception {
        var inheritedCycle = mapper.readTree("""
            {
              "AIStockHunter-Accumulation-Check-*": {"dependsOn":[{"task":"Other","kind":"orderOnly"}]},
              "AIStockHunter-Accumulation-Check-2026-09-22": {"displayName":"特定日期"},
              "Other": {"dependsOn":[{"task":"AIStockHunter-Accumulation-Check-2026-09-22","kind":"data"}]}
            }
            """);
        assertEquals("DEPENDENCY_CYCLE", assertThrows(JobMetadataStore.Invalid.class,
                () -> JobMetadataStore.validate(inheritedCycle)).getMessage());
        ((com.fasterxml.jackson.databind.node.ObjectNode) inheritedCycle.path("AIStockHunter-Accumulation-Check-2026-09-22"))
                .set("dependsOn", mapper.createArrayNode());
        JobMetadataStore.validate(inheritedCycle);
    }

    @Test void patternUserWithoutDependencyFieldStillInheritsDefault() throws Exception {
        var overrides = mapper.readTree("""
            {
              "AIStockHunter-Accumulation-Check-*": {"displayName":"共用名稱"},
              "AIStockHunter-Accumulation-Check-2026-09-22": {},
              "AIStockHunter-UnexplainedVolume-Daily": {"dependsOn":[{"task":"AIStockHunter-Accumulation-Check-2026-09-22","kind":"data"}]}
            }
            """);
        assertEquals("DEPENDENCY_CYCLE", assertThrows(JobMetadataStore.Invalid.class,
                () -> JobMetadataStore.validate(overrides)).getMessage());
    }

    @Test void externalReverseRelationDoesNotCreateCycle() throws Exception {
        var overrides = mapper.readTree("""
            {
              "AIStockHunter-Accumulation-Check-2026-09-22": {},
              "AIStockHunter-UnexplainedVolume-Daily": {"dependsOn":[{"task":"AIStockHunter-Accumulation-Check-2026-09-22","kind":"external"}]}
            }
            """);
        JobMetadataStore.validate(overrides);
    }

    @Test void secOrderOnlyDefaultParticipatesInCycleValidation() throws Exception {
        var overrides = mapper.readTree("""
            {"InsiderTracker-SyncImport":{"dependsOn":[{"task":"InsiderTracker-SEC","kind":"data"}]}}
            """);
        assertEquals("DEPENDENCY_CYCLE", assertThrows(JobMetadataStore.Invalid.class,
                () -> JobMetadataStore.validate(overrides)).getMessage());
        ((com.fasterxml.jackson.databind.node.ObjectNode) overrides).set("InsiderTracker-SEC",
                mapper.readTree("{\"dependsOn\":[]}"));
        JobMetadataStore.validate(overrides);
    }

    @Test void weeklyDataDefaultParticipatesInCycleValidation() throws Exception {
        var overrides = mapper.readTree("""
            {"AIStockHunter-UnexplainedVolume-Daily":{"dependsOn":[{"task":"AIStockHunter-Accumulation-Weekly-Check","kind":"data"}]}}
            """);
        assertEquals("DEPENDENCY_CYCLE", assertThrows(JobMetadataStore.Invalid.class,
                () -> JobMetadataStore.validate(overrides)).getMessage());
        ((com.fasterxml.jackson.databind.node.ObjectNode) overrides).set("AIStockHunter-Accumulation-Weekly-Check",
                mapper.readTree("{\"dependsOn\":[]}"));
        JobMetadataStore.validate(overrides);
    }
}
