package com.ridematching.logging.util;

import java.util.UUID;

public final class TraceIdUtil {

    private TraceIdUtil() {
    }

    public static String generateTraceId() {

        return UUID.randomUUID()
                .toString()
                .replace("-", "");

    }

}