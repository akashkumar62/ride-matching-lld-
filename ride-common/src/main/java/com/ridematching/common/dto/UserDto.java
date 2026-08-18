package com.ridematching.common.dto;

import com.ridematching.common.enums.UserRole;

import java.util.UUID;

public record UserDto(

        UUID id,

        String fullName,

        String email,

        String phone,

        UserRole role

) {
}