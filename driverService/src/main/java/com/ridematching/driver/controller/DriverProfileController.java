package com.ridematching.driver.controller;

import com.ridematching.driver.dto.CreateDriverProfileRequest;
import com.ridematching.driver.dto.DriverProfileResponse;
import com.ridematching.driver.dto.UpdateDriverProfileRequest;
import com.ridematching.driver.service.DriverProfileService;
import com.ridematching.common.response.ApiResponse;
import jakarta.validation.Valid;
import lombok.RequiredArgsConstructor;
import org.springframework.security.core.Authentication;
import org.springframework.web.bind.annotation.*;

@RestController
@RequestMapping("/drivers/profile")
@RequiredArgsConstructor
public class DriverProfileController {

    private final DriverProfileService driverProfileService;

    @PostMapping
    public ApiResponse<DriverProfileResponse> create(
            Authentication authentication,
            @Valid @RequestBody CreateDriverProfileRequest request) {

        return ApiResponse.success(
                driverProfileService.create(authentication.getName(), request));
    }

    @GetMapping
    public ApiResponse<DriverProfileResponse> get(Authentication authentication) {

        return ApiResponse.success(
                driverProfileService.getByEmail(authentication.getName()));
    }

    @PutMapping
    public ApiResponse<DriverProfileResponse> update(
            Authentication authentication,
            @Valid @RequestBody UpdateDriverProfileRequest request) {

        return ApiResponse.success(
                driverProfileService.update(authentication.getName(), request));
    }

}
