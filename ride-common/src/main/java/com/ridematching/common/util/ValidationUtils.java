package com.ridematching.common.util;

public final class ValidationUtils {

    private ValidationUtils() {
    }

    public static boolean hasText(String value) {
        return value != null && !value.trim().isEmpty();
    }

}