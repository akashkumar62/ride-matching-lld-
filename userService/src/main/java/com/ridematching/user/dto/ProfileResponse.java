package com.ridematching.user.dto;

import java.util.UUID;

public record ProfileResponse(

        UUID id,

        String email,

        String fullName,

        String phone

) {
}