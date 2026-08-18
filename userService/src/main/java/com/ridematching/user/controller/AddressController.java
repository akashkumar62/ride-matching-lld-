package com.ridematching.user.controller;

import com.ridematching.user.dto.AddressResponse;
import com.ridematching.user.dto.CreateAddressRequest;
import com.ridematching.user.service.AddressService;
import com.ridematching.common.response.ApiResponse;
import jakarta.validation.Valid;
import lombok.RequiredArgsConstructor;
import org.springframework.security.core.Authentication;
import org.springframework.web.bind.annotation.*;

import java.util.List;
import java.util.UUID;

@RestController
@RequestMapping("/users/addresses")
@RequiredArgsConstructor
public class AddressController {

    private final AddressService addressService;

    @PostMapping
    public ApiResponse<AddressResponse> add(
            Authentication authentication,
            @Valid @RequestBody CreateAddressRequest request) {

        return ApiResponse.success(
                addressService.add(authentication.getName(), request));
    }

    @GetMapping
    public ApiResponse<List<AddressResponse>> list(Authentication authentication) {

        return ApiResponse.success(
                addressService.list(authentication.getName()));
    }

    @DeleteMapping("/{addressId}")
    public ApiResponse<String> delete(
            Authentication authentication,
            @PathVariable UUID addressId) {

        addressService.delete(authentication.getName(), addressId);

        return ApiResponse.success("Address deleted successfully");
    }

}