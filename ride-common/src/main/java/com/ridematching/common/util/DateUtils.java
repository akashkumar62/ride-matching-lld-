package com.ridematching.common.util;

import java.time.Instant;
import java.time.LocalDateTime;
import java.time.ZoneOffset;

public final class DateUtils {

    private DateUtils() {
    }

    public static Instant now() {
        return Instant.now();
    }

    public static LocalDateTime nowUtc() {
        return LocalDateTime.now(ZoneOffset.UTC);
    }

}