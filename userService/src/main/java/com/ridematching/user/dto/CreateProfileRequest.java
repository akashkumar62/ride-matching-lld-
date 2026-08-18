package com.ridematching.user.dto;

import jakarta.validation.constraints.NotBlank;

public record CreateProfileRequest(

        @NotBlank
        String fullName,

        String phone

) {
}