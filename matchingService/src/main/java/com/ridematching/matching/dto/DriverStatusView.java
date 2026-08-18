package com.ridematching.matching.dto;

import com.ridematching.common.enums.DriverStatus;

public record DriverStatusView(

        String email,

        DriverStatus status

) {
}
