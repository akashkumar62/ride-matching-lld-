package com.ridematching.user.dto;

import jakarta.validation.constraints.NotBlank;

public record UpdateProfileRequest(

        @NotBlank
        String fullName,

        String phone

) {
}