package com.ridematching.driver.repository;

import com.ridematching.common.enums.DriverStatus;
import com.ridematching.driver.entity.DriverProfile;
import org.springframework.data.jpa.repository.JpaRepository;

import java.util.List;
import java.util.Optional;
import java.util.UUID;

public interface DriverProfileRepository
        extends JpaRepository<DriverProfile, UUID> {

    Optional<DriverProfile> findByEmail(String email);

    boolean existsByEmail(String email);

    List<DriverProfile> findByStatusIn(List<DriverStatus> statuses);

    List<DriverProfile> findByEmailIn(List<String> emails);

}
