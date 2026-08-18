package com.ridematching.auth.dto;

import com.ridematching.common.enums.UserRole;
import jakarta.validation.constraints.Email;
import jakarta.validation.constraints.NotBlank;

public record RegisterRequest(

        @Email
        String email,

        @NotBlank
        String password,

        UserRole role

) {
}