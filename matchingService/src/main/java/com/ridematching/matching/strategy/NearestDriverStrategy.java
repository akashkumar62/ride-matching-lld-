package com.ridematching.matching.strategy;

import com.ridematching.matching.dto.NearbyDriverResponse;
import org.springframework.stereotype.Component;

import java.util.List;
import java.util.Optional;

@Component
public class NearestDriverStrategy implements DriverMatchingStrategy {

    @Override
    public Optional<String> selectDriver(List<NearbyDriverResponse> candidates) {

        return candidates.isEmpty()
                ? Optional.empty()
                : Optional.of(candidates.get(0).driverEmail());
    }

}
