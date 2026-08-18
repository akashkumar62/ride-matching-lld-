package com.ridematching.common.constants;

public final class RedisKeys {

    private RedisKeys() {
    }

    public static final String DRIVER_LOCATION = "driver:location";

    public static final String DRIVER_LAST_SEEN = "driver:lastseen";

    public static final String DRIVER_STATUS = "driver:status";

    public static final String MATCHING_CLAIM = "matching:claim";

    public static final String ACTIVE_RIDE = "ride:active";

    public static final String JWT_BLACKLIST = "jwt:blacklist";
}