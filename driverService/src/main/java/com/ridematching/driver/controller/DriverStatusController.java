package com.ridematching.driver.controller;

import com.ridematching.driver.dto.DriverProfileResponse;
import com.ridematching.driver.dto.UpdateStatusRequest;
import com.ridematching.driver.service.DriverProfileService;
import com.ridematching.common.response.ApiResponse;
import jakarta.validation.Valid;
import lombok.RequiredArgsConstructor;
import org.springframework.security.core.Authentication;
import org.springframework.web.bind.annotation.*;

@RestController
@RequestMapping("/drivers/status")
@RequiredArgsConstructor
public class DriverStatusController {

    private final DriverProfileService driverProfileService;

    @PutMapping
    public ApiResponse<DriverProfileResponse> update(
            Authentication authentication,
            @RequestHeader("Authorization") String authorization,
            @Valid @RequestBody UpdateStatusRequest request) {

        return ApiResponse.success(
                driverProfileService.updateStatus(authentication.getName(), request, authorization));
    }

}
