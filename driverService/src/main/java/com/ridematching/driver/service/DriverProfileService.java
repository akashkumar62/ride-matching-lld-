package com.ridematching.driver.service;

import com.ridematching.common.constants.KafkaTopics;
import com.ridematching.common.enums.DriverStatus;
import com.ridematching.common.events.DriverAvailableEvent;
import com.ridematching.driver.client.LocationServiceClient;
import com.ridematching.driver.dto.CreateDriverProfileRequest;
import com.ridematching.driver.dto.DriverProfileResponse;
import com.ridematching.driver.dto.DriverStatusView;
import com.ridematching.driver.dto.UpdateDriverProfileRequest;
import com.ridematching.driver.dto.UpdateStatusRequest;
import com.ridematching.driver.entity.DriverProfile;
import com.ridematching.driver.repository.DriverProfileRepository;
import lombok.RequiredArgsConstructor;
import org.springframework.kafka.core.KafkaTemplate;
import org.springframework.stereotype.Service;

import java.time.Instant;
import java.time.LocalDateTime;
import java.util.List;

@Service
@RequiredArgsConstructor
public class DriverProfileService {

    private final DriverProfileRepository repository;
    private final LocationServiceClient locationServiceClient;
    private final KafkaTemplate<String, Object> kafkaTemplate;

    public DriverProfileResponse create(String email, CreateDriverProfileRequest request) {

        if (repository.existsByEmail(email)) {
            throw new RuntimeException("Driver profile already exists");
        }

        DriverProfile profile = new DriverProfile();

        profile.setEmail(email);
        profile.setFullName(request.fullName());
        profile.setPhone(request.phone());
        profile.setVehicleType(request.vehicleType());
        profile.setVehicleNumber(request.vehicleNumber());

        repository.save(profile);

        return toResponse(profile);
    }

    public DriverProfileResponse getByEmail(String email) {

        DriverProfile profile = repository.findByEmail(email)
                .orElseThrow(() -> new RuntimeException("Driver profile not found"));

        return toResponse(profile);
    }

    public DriverProfileResponse update(String email, UpdateDriverProfileRequest request) {

        DriverProfile profile = repository.findByEmail(email)
                .orElseThrow(() -> new RuntimeException("Driver profile not found"));

        profile.setFullName(request.fullName());
        profile.setPhone(request.phone());
        profile.setVehicleType(request.vehicleType());
        profile.setVehicleNumber(request.vehicleNumber());

        repository.save(profile);

        return toResponse(profile);
    }

    public DriverProfileResponse updateStatus(String email, UpdateStatusRequest request,
                                               String authorizationHeader) {

        DriverProfile profile = applyStatus(email, request);

        if (request.status() == DriverStatus.OFFLINE || request.status() == DriverStatus.BUSY) {
            locationServiceClient.removeLocation(authorizationHeader);
        }

        return toResponse(profile);
    }

    /** Admin-initiated status change on behalf of an arbitrary driver — used by the admin "all drivers" panel. */
    public DriverProfileResponse adminUpdateStatus(String email, UpdateStatusRequest request,
                                                    String adminAuthorizationHeader) {

        DriverProfile profile = applyStatus(email, request);

        if (request.status() == DriverStatus.OFFLINE || request.status() == DriverStatus.BUSY) {
            locationServiceClient.removeLocationForEmail(email, adminAuthorizationHeader);
        }

        return toResponse(profile);
    }

    public List<DriverProfileResponse> listAll() {

        return repository.findAll().stream()
                .map(this::toResponse)
                .toList();
    }

    /** One round trip for N candidates instead of N — see the "batch the per-candidate check" fix. */
    public List<DriverStatusView> bulkStatus(List<String> emails) {

        return repository.findByEmailIn(emails).stream()
                .map(p -> new DriverStatusView(p.getEmail(), p.getStatus()))
                .toList();
    }

    private DriverProfile applyStatus(String email, UpdateStatusRequest request) {

        DriverProfile profile = repository.findByEmail(email)
                .orElseThrow(() -> new RuntimeException("Create your driver profile before going online"));

        DriverStatus previousStatus = profile.getStatus();

        profile.setStatus(request.status());
        profile.setStatusUpdatedAt(LocalDateTime.now());

        repository.save(profile);

        // Only a genuine transition into ONLINE, not "already online" — lets matchingService
        // rescan unmatched rides the instant a driver becomes available, instead of waiting
        // for its own retry-scheduler tick.
        if (request.status() == DriverStatus.ONLINE && previousStatus != DriverStatus.ONLINE) {
            kafkaTemplate.send(KafkaTopics.DRIVER_AVAILABLE, email, new DriverAvailableEvent(email, Instant.now()));
        }

        return profile;
    }

    private DriverProfileResponse toResponse(DriverProfile profile) {

        return new DriverProfileResponse(
                profile.getId(),
                profile.getEmail(),
                profile.getFullName(),
                profile.getPhone(),
                profile.getVehicleType(),
                profile.getVehicleNumber(),
                profile.getStatus());
    }

}
