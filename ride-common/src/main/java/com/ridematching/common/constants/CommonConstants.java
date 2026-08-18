package com.ridematching.common.constants;

public final class CommonConstants {

    private CommonConstants() {
    }

    // Headers
    public static final String AUTHORIZATION_HEADER = "Authorization";
    public static final String TRACE_ID_HEADER = "X-Trace-Id";
    public static final String CORRELATION_ID_HEADER = "X-Correlation-Id";

    // JWT
    public static final String BEARER_PREFIX = "Bearer ";

    // Pagination
    public static final int DEFAULT_PAGE = 0;
    public static final int DEFAULT_SIZE = 20;

    // Date format
    public static final String DATE_TIME_PATTERN = "yyyy-MM-dd HH:mm:ss";
}