package com.ridematching.user.dto;

import java.util.UUID;

public record AddressResponse(

        UUID id,

        String label,

        String addressLine,

        Double latitude,

        Double longitude

) {
}