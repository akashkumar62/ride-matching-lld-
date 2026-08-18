package com.ridematching.driver.dto;

import com.ridematching.common.enums.DriverStatus;

/** Minimal per-driver shape for the bulk status lookup — avoids shipping the whole profile
 *  (vehicle details, phone, etc.) N times over when a caller only needs to know who's online. */
public record DriverStatusView(

        String email,

        DriverStatus status

) {
}
