package com.ridematching.user.dto;

import jakarta.validation.constraints.NotBlank;

public record CreateAddressRequest(

        @NotBlank
        String label,

        @NotBlank
        String addressLine,

        Double latitude,

        Double longitude

) {
}