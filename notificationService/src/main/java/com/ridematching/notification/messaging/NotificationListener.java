package com.ridematching.notification.messaging;

import com.ridematching.common.constants.KafkaTopics;
import com.ridematching.common.events.DriverAssignedEvent;
import com.ridematching.common.events.FareCalculatedEvent;
import com.ridematching.common.events.RideCompletedEvent;
import com.ridematching.common.events.RideRequestedEvent;
import lombok.extern.slf4j.Slf4j;
import org.springframework.kafka.annotation.KafkaListener;
import org.springframework.stereotype.Component;

@Slf4j
@Component
public class NotificationListener {

    @KafkaListener(topics = KafkaTopics.RIDE_REQUESTED, groupId = "notification-group")
    public void onRideRequested(RideRequestedEvent event) {
        notify(event.riderEmail(), "We're finding you a nearby driver for ride " + event.rideId());
    }

    @KafkaListener(topics = KafkaTopics.DRIVER_ASSIGNED, groupId = "notification-group")
    public void onDriverAssigned(DriverAssignedEvent event) {
        notify(event.riderEmail(), "Driver " + event.driverEmail() + " has been assigned to your ride " + event.rideId());
        notify(event.driverEmail(), "You've been assigned a new ride: " + event.rideId());
    }

    @KafkaListener(topics = KafkaTopics.RIDE_COMPLETED, groupId = "notification-group")
    public void onRideCompleted(RideCompletedEvent event) {
        notify(event.riderEmail(), "Your ride " + event.rideId() + " is complete. Calculating your fare...");
        if (event.driverEmail() != null) {
            notify(event.driverEmail(), "Ride " + event.rideId() + " marked complete.");
        }
    }

    @KafkaListener(topics = KafkaTopics.FARE_CALCULATED, groupId = "notification-group")
    public void onFareCalculated(FareCalculatedEvent event) {
        notify(event.riderEmail(), "Your fare for ride " + event.rideId() + " is ₹" + event.fare());
    }

    private void notify(String email, String message) {
        log.info("NOTIFY [{}] -> {}", email, message);
    }

}
