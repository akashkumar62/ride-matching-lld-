package com.ridematching.common.constants;

public final class KafkaTopics {

    private KafkaTopics() {
    }

    public static final String RIDE_REQUESTED = "ride.requested";

    public static final String DRIVER_ASSIGNED = "driver.assigned";

    public static final String DRIVER_AVAILABLE = "driver.available";

    public static final String DRIVER_LOCATION_UPDATED = "driver.location.updated";

    public static final String RIDE_STARTED = "ride.started";

    public static final String RIDE_COMPLETED = "ride.completed";

    public static final String RIDE_CANCELLED = "ride.cancelled";

    public static final String FARE_CALCULATED = "fare.calculated";

    public static final String USER_REGISTERED = "user.registered";
}