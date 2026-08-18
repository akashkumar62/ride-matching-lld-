package com.ridematching.matching.dto;

import com.ridematching.common.enums.UserRole;

public record RegisterRequest(

        String email,

        String password,

        UserRole role

) {
}
