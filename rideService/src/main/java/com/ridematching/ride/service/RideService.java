package com.ridematching.ride.service;

import com.ridematching.common.constants.KafkaTopics;
import com.ridematching.common.dto.LocationDto;
import com.ridematching.common.enums.RideStatus;
import com.ridematching.common.events.RideCancelledEvent;
import com.ridematching.common.events.RideCompletedEvent;
import com.ridematching.common.events.RideRequestedEvent;
import com.ridematching.ride.dto.CreateRideRequest;
import com.ridematching.ride.dto.RideResponse;
import com.ridematching.ride.entity.Ride;
import com.ridematching.ride.repository.RideRepository;
import com.ridematching.ride.streaming.RideStreamRegistry;
import lombok.RequiredArgsConstructor;
import org.springframework.kafka.core.KafkaTemplate;
import org.springframework.stereotype.Service;

import java.time.Instant;
import java.time.LocalDateTime;
import java.util.List;
import java.util.UUID;

@Service
@RequiredArgsConstructor
public class RideService {

    private final RideRepository repository;
    private final KafkaTemplate<String, Object> kafkaTemplate;
    private final RideStreamRegistry rideStreamRegistry;

    public RideResponse create(String riderEmail, CreateRideRequest request) {

        Ride ride = new Ride();

        ride.setRiderEmail(riderEmail);
        ride.setPickupLatitude(request.pickup().latitude());
        ride.setPickupLongitude(request.pickup().longitude());
        ride.setDestinationLatitude(request.destination().latitude());
        ride.setDestinationLongitude(request.destination().longitude());

        repository.save(ride);

        kafkaTemplate.send(
                KafkaTopics.RIDE_REQUESTED,
                ride.getId().toString(),
                new RideRequestedEvent(
                        ride.getId(),
                        riderEmail,
                        request.pickup(),
                        request.destination(),
                        Instant.now()));

        return toResponse(ride);
    }

    public List<RideResponse> listUnmatched(long olderThanSeconds) {

        LocalDateTime cutoff = LocalDateTime.now().minusSeconds(olderThanSeconds);

        return repository.findByStatusAndCreatedAtBefore(RideStatus.REQUESTED, cutoff)
                .stream()
                .map(this::toResponse)
                .toList();
    }

    public RideResponse getVisibleTo(UUID id, String email) {

        Ride ride = findParticipant(id, email);

        return toResponse(ride);
    }

    /** Internal use only (Kafka listeners, the stale-ride reaper) — no participant check, trusted callers. */
    public RideResponse getById(UUID id) {

        return repository.findById(id)
                .map(this::toResponse)
                .orElse(null);
    }

    public List<RideResponse> listMine(String riderEmail) {

        return repository.findByRiderEmailOrderByCreatedAtDesc(riderEmail)
                .stream()
                .map(this::toResponse)
                .toList();
    }

    public RideResponse cancel(UUID id, String riderEmail) {

        Ride ride = repository.findById(id)
                .filter(r -> r.getRiderEmail().equals(riderEmail))
                .orElseThrow(() -> new RuntimeException("Ride not found"));

        if (ride.getStatus() != RideStatus.REQUESTED
                && ride.getStatus() != RideStatus.DRIVER_ASSIGNED) {
            throw new RuntimeException("Ride cannot be cancelled in its current state");
        }

        String assignedDriverEmail = ride.getDriverEmail();

        ride.setStatus(RideStatus.CANCELLED);

        repository.save(ride);

        if (assignedDriverEmail != null) {
            kafkaTemplate.send(
                    KafkaTopics.RIDE_CANCELLED,
                    ride.getId().toString(),
                    new RideCancelledEvent(
                            ride.getId(),
                            riderEmail,
                            assignedDriverEmail,
                            Instant.now()));
        }

        RideResponse response = toResponse(ride);
        rideStreamRegistry.publish(id, response);
        return response;
    }

    public RideResponse driverCancel(UUID id, String driverEmail) {

        int updated = repository.driverCancelIfAssigned(id, driverEmail);

        if (updated == 0) {
            throw new RuntimeException("Ride cannot be cancelled — it may have already progressed or isn't assigned to you");
        }

        Ride ride = repository.findById(id)
                .orElseThrow(() -> new RuntimeException("Ride not found"));

        kafkaTemplate.send(
                KafkaTopics.RIDE_REQUESTED,
                ride.getId().toString(),
                new RideRequestedEvent(
                        ride.getId(),
                        ride.getRiderEmail(),
                        new LocationDto(ride.getPickupLatitude(), ride.getPickupLongitude()),
                        new LocationDto(ride.getDestinationLatitude(), ride.getDestinationLongitude()),
                        Instant.now()));

        RideResponse response = toResponse(ride);
        rideStreamRegistry.publish(id, response);
        return response;
    }

    public RideResponse accept(UUID id, String driverEmail) {

        int updated = repository.acceptIfAvailable(id, driverEmail);

        if (updated == 0) {
            throw new RuntimeException("Ride is no longer available for acceptance");
        }

        Ride ride = repository.findById(id)
                .orElseThrow(() -> new RuntimeException("Ride not found"));

        RideResponse response = toResponse(ride);
        rideStreamRegistry.publish(id, response);
        return response;
    }

    public RideResponse arrive(UUID id, String driverEmail) {

        Ride ride = findAssignedDriverRide(id, driverEmail);

        if (ride.getStatus() != RideStatus.DRIVER_ASSIGNED) {
            throw new RuntimeException("Ride must be in DRIVER_ASSIGNED status to mark arrival");
        }

        ride.setStatus(RideStatus.DRIVER_ARRIVED);

        repository.save(ride);

        RideResponse response = toResponse(ride);
        rideStreamRegistry.publish(id, response);
        return response;
    }

    public RideResponse start(UUID id, String driverEmail) {

        Ride ride = findAssignedDriverRide(id, driverEmail);

        if (ride.getStatus() != RideStatus.DRIVER_ARRIVED) {
            throw new RuntimeException("Ride must be in DRIVER_ARRIVED status to start");
        }

        ride.setStatus(RideStatus.STARTED);

        repository.save(ride);

        RideResponse response = toResponse(ride);
        rideStreamRegistry.publish(id, response);
        return response;
    }

    public RideResponse complete(UUID id, String driverEmail) {

        Ride ride = findAssignedDriverRide(id, driverEmail);

        if (ride.getStatus() != RideStatus.STARTED) {
            throw new RuntimeException("Ride must be in STARTED status to complete");
        }

        ride.setStatus(RideStatus.COMPLETED);

        repository.save(ride);

        kafkaTemplate.send(
                KafkaTopics.RIDE_COMPLETED,
                ride.getId().toString(),
                new RideCompletedEvent(
                        ride.getId(),
                        ride.getRiderEmail(),
                        ride.getDriverEmail(),
                        new LocationDto(ride.getPickupLatitude(), ride.getPickupLongitude()),
                        new LocationDto(ride.getDestinationLatitude(), ride.getDestinationLongitude()),
                        Instant.now()));

        RideResponse response = toResponse(ride);
        rideStreamRegistry.publish(id, response);
        return response;
    }

    private Ride findParticipant(UUID id, String email) {

        return repository.findById(id)
                .filter(r -> r.getRiderEmail().equals(email)
                        || email.equals(r.getDriverEmail()))
                .orElseThrow(() -> new RuntimeException("Ride not found"));
    }

    private Ride findAssignedDriverRide(UUID id, String driverEmail) {

        return repository.findById(id)
                .filter(r -> driverEmail.equals(r.getDriverEmail()))
                .orElseThrow(() -> new RuntimeException("You are not the assigned driver for this ride"));
    }

    private RideResponse toResponse(Ride ride) {

        return new RideResponse(
                ride.getId(),
                ride.getRiderEmail(),
                ride.getDriverEmail(),
                new LocationDto(ride.getPickupLatitude(), ride.getPickupLongitude()),
                new LocationDto(ride.getDestinationLatitude(), ride.getDestinationLongitude()),
                ride.getStatus(),
                ride.getFare(),
                ride.getCreatedAt());
    }

}
