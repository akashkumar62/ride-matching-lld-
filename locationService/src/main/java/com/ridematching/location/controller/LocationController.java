package com.ridematching.location.controller;

import com.ridematching.common.dto.LocationDto;
import com.ridematching.common.response.ApiResponse;
import com.ridematching.location.dto.AllDriversLocationResponse;
import com.ridematching.location.dto.DriverLocationResponse;
import com.ridematching.location.dto.NearbyDriverResponse;
import com.ridematching.location.service.LocationService;
import jakarta.validation.Valid;
import lombok.RequiredArgsConstructor;
import org.springframework.security.core.Authentication;
import org.springframework.web.bind.annotation.*;

import java.util.List;

@RestController
@RequestMapping("/locations")
@RequiredArgsConstructor
public class LocationController {

    private final LocationService locationService;

    @PutMapping
    public ApiResponse<DriverLocationResponse> update(
            Authentication authentication,
            @Valid @RequestBody LocationDto location) {

        return ApiResponse.success(
                locationService.updateLocation(authentication.getName(), location));
    }

    @DeleteMapping
    public ApiResponse<String> remove(Authentication authentication) {

        locationService.removeLocation(authentication.getName());

        return ApiResponse.success("Location removed successfully");
    }

    @GetMapping("/nearby")
    public ApiResponse<List<NearbyDriverResponse>> nearby(
            @RequestParam double latitude,
            @RequestParam double longitude,
            @RequestParam(defaultValue = "5") double radiusKm,
            @RequestParam(defaultValue = "10") int limit) {

        return ApiResponse.success(
                locationService.findNearby(latitude, longitude, radiusKm, limit));
    }

    /** Every currently-fresh driver's position in one call — for fleet-wide visualization (e.g. the load-test ops map), not nearest-driver search. */
    @GetMapping("/all")
    public ApiResponse<List<AllDriversLocationResponse>> all() {

        return ApiResponse.success(locationService.findAll());
    }

    @GetMapping("/{email}")
    public ApiResponse<DriverLocationResponse> get(@PathVariable String email) {

        return ApiResponse.success(locationService.findOne(email));
    }

    /** Admin-scoped: set an arbitrary driver's location, used by the admin "all drivers" panel. */
    @PutMapping("/{email}")
    public ApiResponse<DriverLocationResponse> adminUpdate(
            @PathVariable String email,
            @Valid @RequestBody LocationDto location) {

        return ApiResponse.success(locationService.updateLocation(email, location));
    }

    /** Admin-scoped: clear an arbitrary driver's location — also used by driverService when an admin flips a driver OFFLINE/BUSY. */
    @DeleteMapping("/{email}")
    public ApiResponse<String> adminRemove(@PathVariable String email) {

        locationService.removeLocation(email);

        return ApiResponse.success("Location removed successfully");
    }

}
