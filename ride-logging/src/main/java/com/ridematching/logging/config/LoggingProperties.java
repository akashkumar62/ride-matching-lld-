package com.ridematching.logging.config;

import org.springframework.boot.context.properties.ConfigurationProperties;

@ConfigurationProperties(prefix = "ride.logging")
public class LoggingProperties {

    private boolean requestLogging = true;

    private boolean responseLogging = true;

    private boolean generateTraceId = true;

    public boolean isRequestLogging() {
        return requestLogging;
    }

    public void setRequestLogging(boolean requestLogging) {
        this.requestLogging = requestLogging;
    }

    public boolean isResponseLogging() {
        return responseLogging;
    }

    public void setResponseLogging(boolean responseLogging) {
        this.responseLogging = responseLogging;
    }

    public boolean isGenerateTraceId() {
        return generateTraceId;
    }

    public void setGenerateTraceId(boolean generateTraceId) {
        this.generateTraceId = generateTraceId;
    }
}