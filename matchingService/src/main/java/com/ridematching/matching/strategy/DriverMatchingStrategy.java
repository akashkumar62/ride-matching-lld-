package com.ridematching.matching.strategy;

import com.ridematching.matching.dto.NearbyDriverResponse;

import java.util.List;
import java.util.Optional;

public interface DriverMatchingStrategy {

    Optional<String> selectDriver(List<NearbyDriverResponse> candidates);

}
