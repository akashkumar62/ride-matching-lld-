package com.ridematching.ride.controller;

import com.ridematching.ride.dto.CreateRideRequest;
import com.ridematching.ride.dto.RideResponse;
import com.ridematching.ride.service.RideService;
import com.ridematching.ride.streaming.RideStreamRegistry;
import com.ridematching.common.response.ApiResponse;
import jakarta.validation.Valid;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.http.MediaType;
import org.springframework.security.core.Authentication;
import org.springframework.web.bind.annotation.*;
import org.springframework.web.servlet.mvc.method.annotation.SseEmitter;

import java.io.IOException;
import java.util.List;
import java.util.UUID;

@Slf4j
@RestController
@RequestMapping("/rides")
@RequiredArgsConstructor
public class RideController {

    private final RideService rideService;
    private final RideStreamRegistry rideStreamRegistry;

    @PostMapping
    public ApiResponse<RideResponse> create(
            Authentication authentication,
            @Valid @RequestBody CreateRideRequest request) {

        return ApiResponse.success(
                rideService.create(authentication.getName(), request));
    }

    @GetMapping("/mine")
    public ApiResponse<List<RideResponse>> listMine(Authentication authentication) {

        return ApiResponse.success(
                rideService.listMine(authentication.getName()));
    }

    @GetMapping("/unmatched")
    public ApiResponse<List<RideResponse>> unmatched(
            @RequestParam(defaultValue = "20") long olderThanSeconds) {

        return ApiResponse.success(
                rideService.listUnmatched(olderThanSeconds));
    }

    @GetMapping("/{id}")
    public ApiResponse<RideResponse> get(
            Authentication authentication,
            @PathVariable UUID id) {

        return ApiResponse.success(
                rideService.getVisibleTo(id, authentication.getName()));
    }

    /** "Push instead of poll" — see the Dispatch Internals write-up. getVisibleTo() throws
     *  (404-mapped) for a non-participant, so the participant check happens before the stream opens. */
    @GetMapping(value = "/{id}/stream", produces = MediaType.TEXT_EVENT_STREAM_VALUE)
    public SseEmitter stream(
            Authentication authentication,
            @PathVariable UUID id) {

        RideResponse current = rideService.getVisibleTo(id, authentication.getName());

        SseEmitter emitter = rideStreamRegistry.subscribe(id);

        try {
            emitter.send(SseEmitter.event().name("ride").data(current));
        } catch (IOException e) {
            log.warn("Failed to send initial SSE snapshot for ride {}: {}", id, e.getMessage());
        }

        return emitter;
    }

    @PutMapping("/{id}/cancel")
    public ApiResponse<RideResponse> cancel(
            Authentication authentication,
            @PathVariable UUID id) {

        return ApiResponse.success(
                rideService.cancel(id, authentication.getName()));
    }

    @PutMapping("/{id}/accept")
    public ApiResponse<RideResponse> accept(
            Authentication authentication,
            @PathVariable UUID id) {

        return ApiResponse.success(
                rideService.accept(id, authentication.getName()));
    }

    @PutMapping("/{id}/driver-cancel")
    public ApiResponse<RideResponse> driverCancel(
            Authentication authentication,
            @PathVariable UUID id) {

        return ApiResponse.success(
                rideService.driverCancel(id, authentication.getName()));
    }

    @PutMapping("/{id}/arrive")
    public ApiResponse<RideResponse> arrive(
            Authentication authentication,
            @PathVariable UUID id) {

        return ApiResponse.success(
                rideService.arrive(id, authentication.getName()));
    }

    @PutMapping("/{id}/start")
    public ApiResponse<RideResponse> start(
            Authentication authentication,
            @PathVariable UUID id) {

        return ApiResponse.success(
                rideService.start(id, authentication.getName()));
    }

    @PutMapping("/{id}/complete")
    public ApiResponse<RideResponse> complete(
            Authentication authentication,
            @PathVariable UUID id) {

        return ApiResponse.success(
                rideService.complete(id, authentication.getName()));
    }

}
