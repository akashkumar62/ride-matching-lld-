package com.ridematching.user.controller;

import com.ridematching.user.dto.CreateProfileRequest;
import com.ridematching.user.dto.ProfileResponse;
import com.ridematching.user.dto.UpdateProfileRequest;
import com.ridematching.user.service.ProfileService;
import com.ridematching.common.response.ApiResponse;
import jakarta.validation.Valid;
import lombok.RequiredArgsConstructor;
import org.springframework.security.core.Authentication;
import org.springframework.web.bind.annotation.*;

@RestController
@RequestMapping("/users/profile")
@RequiredArgsConstructor
public class ProfileController {

    private final ProfileService profileService;

    @PostMapping
    public ApiResponse<ProfileResponse> create(
            Authentication authentication,
            @Valid @RequestBody CreateProfileRequest request) {

        return ApiResponse.success(
                profileService.create(authentication.getName(), request));
    }

    @GetMapping
    public ApiResponse<ProfileResponse> get(Authentication authentication) {

        return ApiResponse.success(
                profileService.getByEmail(authentication.getName()));
    }

    @PutMapping
    public ApiResponse<ProfileResponse> update(
            Authentication authentication,
            @Valid @RequestBody UpdateProfileRequest request) {

        return ApiResponse.success(
                profileService.update(authentication.getName(), request));
    }

}