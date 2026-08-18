package com.ridematching.pricing.service;

import com.ridematching.common.dto.LocationDto;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Service;

@Service
public class FareCalculator {

    private final double baseFare;
    private final double ratePerKm;

    public FareCalculator(@Value("${pricing.base-fare}") double baseFare,
                           @Value("${pricing.rate-per-km}") double ratePerKm) {
        this.baseFare = baseFare;
        this.ratePerKm = ratePerKm;
    }

    public double calculate(LocationDto pickup, LocationDto destination) {

        double distanceKm = haversineKm(
                pickup.latitude(), pickup.longitude(),
                destination.latitude(), destination.longitude());

        return Math.round((baseFare + ratePerKm * distanceKm) * 100.0) / 100.0;
    }

    private double haversineKm(double lat1, double lon1, double lat2, double lon2) {

        double earthRadiusKm = 6371.0;

        double dLat = Math.toRadians(lat2 - lat1);
        double dLon = Math.toRadians(lon2 - lon1);

        double a = Math.sin(dLat / 2) * Math.sin(dLat / 2)
                + Math.cos(Math.toRadians(lat1)) * Math.cos(Math.toRadians(lat2))
                * Math.sin(dLon / 2) * Math.sin(dLon / 2);

        double c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));

        return earthRadiusKm * c;
    }

}
