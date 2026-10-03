package io.github.neil1031.dashboard;

import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.io.TempDir;
import java.nio.file.*;
import java.util.*;
import static org.assertj.core.api.Assertions.*;

class BoundedSourceProcessTest {
    @TempDir Path temp;
    static List<String> argv(String fixture, String... args) {
        var cmd=new ArrayList<>(List.of(Path.of(System.getProperty("java.home"),"bin","java.exe").toString(),"-cp",System.getProperty("java.class.path"),fixture));cmd.addAll(List.of(args));return cmd;
    }
    public static class StdinFixture {
        public static void main(String[] args) throws Exception {
            if(System.in.read()!=-1)throw new AssertionError("stdin must close");
            System.out.print(System.getenv("PYTHONDONTWRITEBYTECODE")+":"+System.getenv("PYTHONIOENCODING")+":"+System.getenv("PYTHONUTF8"));System.exit(2);
        }
    }
    @Test void closesStdinSetsReviewedEnvironmentAndReturnsExitWithoutBusinessPolicy() throws Exception {
        var out=BoundedSourceProcess.run(argv(StdinFixture.class.getName()),2,1000,1000,BoundedSourceProcess::start);
        assertThat(out.exit()).isEqualTo(2);assertThat(out.utf8()).isEqualTo("1:utf-8:1");
    }
    @Test void timeoutKillsCapturedDescendantAndParentBeforeReturning() throws Exception {
        var file=temp.resolve("tree");var parents=new ArrayList<Process>();
        assertThatThrownBy(()->BoundedSourceProcess.run(argv(TwProcessFixture.class.getName(),"tree",file.toString()),2,1000,1000,c->{var p=BoundedSourceProcess.start(c);parents.add(p);return p;}))
            .isInstanceOf(BoundedSourceProcess.Failure.class).extracting("code").isEqualTo("SOURCE_TIMEOUT");
        long pid=Long.parseLong(Files.readString(Path.of(file+".pid")));assertThat(ProcessHandle.of(pid).map(ProcessHandle::isAlive).orElse(false)).isFalse();assertThat(parents.get(0).isAlive()).isFalse();
    }
    @Test void interruptedReadAlsoKillsConfirmedDescendantAndParent() throws Exception {
        var file=temp.resolve("interrupted-tree");var parents=new java.util.concurrent.CopyOnWriteArrayList<Process>();
        var result=new java.util.concurrent.atomic.AtomicReference<Exception>();
        var worker=new Thread(()->{try {BoundedSourceProcess.run(argv(TwProcessFixture.class.getName(),"tree",file.toString()),10,1000,1000,c->{var p=BoundedSourceProcess.start(c);parents.add(p);return p;});}catch(Exception e){result.set(e);}});
        worker.start();long deadline=System.nanoTime()+java.util.concurrent.TimeUnit.SECONDS.toNanos(3);
        while(!Files.exists(Path.of(file+".pid"))&&System.nanoTime()<deadline)Thread.sleep(10);
        assertThat(Files.exists(Path.of(file+".pid"))).isTrue();long pid=Long.parseLong(Files.readString(Path.of(file+".pid")));
        assertThat(ProcessHandle.of(pid).map(ProcessHandle::isAlive).orElse(false)).isTrue();worker.interrupt();worker.join(2000);
        assertThat(worker.isAlive()).isFalse();assertThat(result.get()).isInstanceOf(InterruptedException.class);
        assertThat(parents.get(0).isAlive()).isFalse();assertThat(ProcessHandle.of(pid).map(ProcessHandle::isAlive).orElse(false)).isFalse();
    }
}
