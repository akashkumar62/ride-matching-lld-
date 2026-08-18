package com.ridematching.driver.controller;

import com.ridematching.common.response.ApiResponse;
import com.ridematching.driver.dto.BulkStatusRequest;
import com.ridematching.driver.dto.DriverProfileResponse;
import com.ridematching.driver.dto.DriverStatusView;
import com.ridematching.driver.dto.UpdateStatusRequest;
import com.ridematching.driver.service.DriverProfileService;
import jakarta.validation.Valid;
import lombok.RequiredArgsConstructor;
import org.springframework.web.bind.annotation.*;

import java.util.List;

/**
 * Internal/admin surface: lets an ADMIN-role caller (a human admin session, or another
 * service such as matchingService authenticating as its own service account) see and
 * drive any driver's status, rather than only the authenticated driver's own record.
 */
@RestController
@RequestMapping("/drivers")
@RequiredArgsConstructor
public class DriverAdminController {

    private final DriverProfileService driverProfileService;

    @GetMapping
    public ApiResponse<List<DriverProfileResponse>> listAll() {

        return ApiResponse.success(driverProfileService.listAll());
    }

    @GetMapping("/status")
    public ApiResponse<DriverProfileResponse> statusByEmail(@RequestParam String email) {

        return ApiResponse.success(driverProfileService.getByEmail(email));
    }

    /** One call for N candidates instead of N calls — see "batch the per-candidate check" in Dispatch Internals. */
    @PostMapping("/status/bulk")
    public ApiResponse<List<DriverStatusView>> bulkStatus(@Valid @RequestBody BulkStatusRequest request) {

        return ApiResponse.success(driverProfileService.bulkStatus(request.emails()));
    }

    @PutMapping("/{email}/status")
    public ApiResponse<DriverProfileResponse> adminUpdateStatus(
            @PathVariable String email,
            @RequestHeader("Authorization") String authorization,
            @Valid @RequestBody UpdateStatusRequest request) {

        return ApiResponse.success(
                driverProfileService.adminUpdateStatus(email, request, authorization));
    }

}
