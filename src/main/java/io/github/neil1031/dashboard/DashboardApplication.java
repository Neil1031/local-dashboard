package io.github.neil1031.dashboard;

import org.springframework.boot.SpringApplication;
import org.springframework.boot.autoconfigure.SpringBootApplication;
import org.springframework.boot.context.properties.EnableConfigurationProperties;
import io.github.neil1031.dashboard.runner.RunnerReceiptProperties;

@SpringBootApplication
@EnableConfigurationProperties({SchedulerProperties.class, HistoryProperties.class, RunnerReceiptProperties.class})
public class DashboardApplication {
    public static void main(String[] args) {
        SpringApplication.run(DashboardApplication.class, args);
    }
}
